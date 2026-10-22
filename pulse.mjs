/* Decode the transient FFE1 button state as a rising edge. Pure, testable. */
export class PulseEdgeTracker {
  constructor() { this.reset(); }
  reset() { this.last = null; this.edges = 0; this.releases = 0; }
  accept(byte) {
    if (byte !== 0 && byte !== 1) return {kind:'invalid', value:byte};
    if (this.last === null) {
      this.last = byte;
      return {kind:'baseline', value:byte};
    }
    if (this.last === byte) return {kind:'same', value:byte};
    this.last = byte;
    if (byte === 1) { this.edges++; return {kind:'press', value:byte}; }
    this.releases++;
    return {kind:'release', value:byte};
  }
}
