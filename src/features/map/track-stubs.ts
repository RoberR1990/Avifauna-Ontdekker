// Event-stubs voor de statistiek (docs/FASE-1.md §6). De statistiekagent sluit deze later aan op src/lib/track.ts.
// Nooit locatie of zone-uit-GPS meegeven.

export function mapOpen(): void {
  // no-op
}

export function gpsToggle(on: boolean): void {
  void on
  // no-op
}
