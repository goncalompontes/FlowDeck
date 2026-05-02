import http from "http"
import fs from "fs"
import path from "path"
import { fileURLToPath } from "url"
import { readDashboardData } from "./lib/state-reader"
import { findOpenPort } from "./lib/port-finder"
import ejs from "ejs"

const __dirname = path.dirname(fileURLToPath(import.meta.url))

async function startServer(port: number, projectDir: string) {
  const viewsPath = path.join(__dirname, "views")
  const portFile = path.join(projectDir, ".dashboard", "port")

  const server = http.createServer(async (req, res) => {
    if (req.url === "/health") {
      res.writeHead(200, { "Content-Type": "application/json" })
      res.end(JSON.stringify({ ok: true, port, pid: process.pid }))
      return
    }

    const data = readDashboardData(projectDir)

    if (req.url === "/refresh" || req.url === "/") {
      try {
        const template = fs.readFileSync(path.join(viewsPath, "index.ejs"), "utf-8")
        const html = ejs.render(template, data)
        res.writeHead(200, { "Content-Type": "text/html" })
        res.end(html)
      } catch (err) {
        res.writeHead(500)
        res.end("Template error")
      }
      return
    }

    res.writeHead(404)
    res.end("Not Found")
  })

  fs.writeFileSync(portFile, String(port), "utf-8")

  server.listen(port, () => {
    console.log(`Dashboard server running on port ${port}`)
  })
}

const portResult = await findOpenPort(3456, 100)
const projectDir = process.argv.find(a => a.startsWith("--dir="))?.split("=")[1] || process.cwd()

startServer(portResult.port, projectDir)