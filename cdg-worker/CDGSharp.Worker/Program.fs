// Karaoke Propio — cdg-worker
//
// Thin HTTP wrapper around the CDGSharp library (MIT, Copyright (c) 2022
// Johannes Egger — see ../CDGSharp/LICENSE), vendored unmodified in
// ../CDGSharp. This project adds ONLY an HTTP entrypoint; it does not touch
// the already-validated .lrc -> .cdg rendering pipeline
// (prompt_de_implementacion.md #36/#52 — "No volver a dedicar horas a
// color de sílaba, continuidad tipográfica, slicing de palabras, timing
// silábico básico"). The exact same function calls the validated CLI's
// `convert-lrc` subcommand makes are reused here verbatim, just invoked from
// an HTTP handler instead of Program.fs's CLI entrypoint.
//
// UltraStar song.txt -> .lrc conversion happens OUTSIDE this service, in
// server/Acquisition/UltraStarToLrc.ts (TypeScript, easier to test
// thoroughly against the real reference fixture) — this worker only ever
// sees already-valid .lrc content.
open System
open System.IO
open System.Net
open System.Text
open System.Text.Json
open CDG
open CDG.ImageProcessing
open CDG.KaraokeGenerator
open CDG.LrcParser
open CDG.LrcToKaraoke
open CDG.Serializer

// Font matches the validated POC's fix for Linux/Docker environments (system
// "Arial" isn't installed there) — see prompt_de_implementacion.md #36 point 2.
let defaultSettings: Settings = {
    BackgroundColor = { Red = ColorChannel 0uy; Green = ColorChannel 0uy; Blue = ColorChannel 8uy }
    DefaultTextColor = { Red = ColorChannel 15uy; Green = ColorChannel 15uy; Blue = ColorChannel 15uy }
    SungTextColor = { Red = ColorChannel 6uy; Green = ColorChannel 6uy; Blue = ColorChannel 6uy }
    DefaultFont = { Type = SystemFont "DejaVu Sans"; Size = 16; Style = Regular }
}

let jsonString (doc: JsonElement) (name: string) : string option =
    match doc.TryGetProperty(name) with
    | true, v when v.ValueKind = JsonValueKind.String -> Some (v.GetString())
    | _ -> None

let sendJson (ctx: HttpListenerContext) (status: int) (body: string) =
    let bytes = Encoding.UTF8.GetBytes(body)
    ctx.Response.StatusCode <- status
    ctx.Response.ContentType <- "application/json"
    ctx.Response.ContentLength64 <- int64 bytes.Length
    ctx.Response.OutputStream.Write(bytes, 0, bytes.Length)
    ctx.Response.OutputStream.Close()

let isSafeAbsolutePath (p: string) =
    not (String.IsNullOrWhiteSpace p) && Path.IsPathRooted(p) && not (p.Contains('\000'))

let convertLrc (lrcContent: string) (outputPath: string) (tmpPath: string) =
    if not (isSafeAbsolutePath outputPath) || not (isSafeAbsolutePath tmpPath) then
        failwith "outputPath/tmpPath must be absolute paths"

    Directory.CreateDirectory(Path.GetDirectoryName(outputPath)) |> ignore
    Directory.CreateDirectory(Path.GetDirectoryName(tmpPath)) |> ignore

    // LrcFile.parseFile reads from a path (File.ReadLines) — write the
    // received content to a real temp .lrc file rather than modifying the
    // validated parser to also accept a string
    let tmpLrcPath = tmpPath + ".lrc-src"
    File.WriteAllText(tmpLrcPath, lrcContent)

    try
        let bytes =
            LrcFile.parseFile tmpLrcPath
            |> LrcToKaraoke.getKaraokeCommands defaultSettings
            |> KaraokeGenerator.generate
            |> Serializer.serializePackets

        File.WriteAllBytes(tmpPath, bytes)
        File.Move(tmpPath, outputPath, overwrite = true) // atomic publish
    finally
        File.Delete(tmpLrcPath)

let handleConvertLrc (ctx: HttpListenerContext) =
    try
        use reader = new StreamReader(ctx.Request.InputStream, Encoding.UTF8)
        let body = reader.ReadToEnd()
        use doc = JsonDocument.Parse(body)
        let root = doc.RootElement

        match jsonString root "lrcContent", jsonString root "outputPath", jsonString root "tmpPath" with
        | Some lrcContent, Some outputPath, Some tmpPath ->
            try
                convertLrc lrcContent outputPath tmpPath
                sendJson ctx 200 (JsonSerializer.Serialize({| outputPath = outputPath |}))
            with ex ->
                sendJson ctx 500 (JsonSerializer.Serialize({| error = ex.Message |}))
        | _ ->
            sendJson ctx 422 (JsonSerializer.Serialize({| error = "lrcContent, outputPath and tmpPath are required" |}))
    with ex ->
        sendJson ctx 400 (JsonSerializer.Serialize({| error = ex.Message |}))

[<EntryPoint>]
let main _ =
    let port =
        match Int32.TryParse(Environment.GetEnvironmentVariable("PORT")) with
        | true, p -> p
        | false, _ -> 4200

    let listener = new HttpListener()
    listener.Prefixes.Add($"http://+:{port}/")
    listener.Start()
    printfn "cdg-worker listening on :%d" port

    while true do
        let ctx = listener.GetContext()
        try
            match ctx.Request.HttpMethod, ctx.Request.Url.AbsolutePath with
            | "GET", "/health" -> sendJson ctx 200 (JsonSerializer.Serialize({| ok = true |}))
            | "POST", "/convert-lrc" -> handleConvertLrc ctx
            | _ -> sendJson ctx 404 (JsonSerializer.Serialize({| error = "not found" |}))
        with ex ->
            sendJson ctx 500 (JsonSerializer.Serialize({| error = ex.Message |}))

    0
