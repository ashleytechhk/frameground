#!/usr/bin/env node
// Flutter CLI does not treat SIGUSR1 as a hot-reload signal on every platform.
// Frameground uses this tiny resident supervisor as the stable runner PID: it
// accepts SIGUSR1 from the watcher and translates it to Flutter's documented
// interactive `r` command without navigating any preview iframe.
import { spawn } from 'node:child_process'

const [flutterBinary, ...flutterArgs] = process.argv.slice(2)
if (!flutterBinary || flutterArgs.length === 0) {
  console.error('Usage: flutter-supervisor.mjs <flutter-binary> <flutter args…>')
  process.exit(64)
}

const flutter = spawn(flutterBinary, flutterArgs, {
  stdio: ['pipe', 'pipe', 'pipe'],
  env: process.env,
})

flutter.stdout.pipe(process.stdout)
flutter.stderr.pipe(process.stderr)
process.stdin.on('data', data => flutter.stdin.write(data))

process.on('SIGUSR1', () => {
  // `r` is Flutter CLI's hot-reload command. Do not signal the child directly:
  // recent Flutter tool versions exit when they receive SIGUSR1 themselves.
  flutter.stdin.write('r\n')
})
process.on('SIGUSR2', () => flutter.stdin.write('R\n'))
process.on('SIGTERM', () => flutter.kill('SIGTERM'))
process.on('SIGINT', () => flutter.kill('SIGINT'))

flutter.once('error', error => {
  console.error(error.stack || error.message)
  process.exit(1)
})
flutter.once('exit', (code, signal) => {
  // stdin remains open while Vite owns this supervisor. Exit explicitly so a
  // stopped Flutter child cannot leave an orphan supervisor behind.
  process.exit(code ?? (signal ? 1 : 0))
})
