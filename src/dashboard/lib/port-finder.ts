import http from "http"

export interface PortFinderResult {
  port: number
  host: string
}

/**
 * Finds an open port starting from startPort.
 * Uses Node.js http createServer to check port availability.
 */
export async function findOpenPort(startPort: number = 3456, maxRetries: number = 100): Promise<PortFinderResult> {
  let port = startPort
  let retries = 0

  while (retries < maxRetries) {
    const result = await tryPort(port)
    if (result.available) {
      return { port, host: "localhost" }
    }
    port++
    retries++
  }

  throw new Error(`Could not find open port after ${maxRetries} attempts starting from ${startPort}`)
}

function tryPort(port: number): Promise<{ available: boolean }> {
  return new Promise((resolve) => {
    const server = http.createServer()

    server.once("error", () => {
      resolve({ available: false })
    })

    server.once("listening", () => {
      server.close(() => {
        resolve({ available: true })
      })
    })

    server.listen(port, "127.0.0.1")
  })
}