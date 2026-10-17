// Event-stubs voor statistieken (FASE-1 §6). No-op tot src/lib/track.ts er is; dan hier doorverbinden.
// Nooit locatie of antwoorden meesturen: alleen het expeditie-id.
export function expeditionStart(id: string): void {
  void id
}

export function expeditionComplete(id: string): void {
  void id
}
