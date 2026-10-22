import assert from 'node:assert/strict';
import {PulseEdgeTracker} from './pulse.mjs';
const p=new PulseEdgeTracker();
assert.equal(p.accept(0).kind,'baseline');
assert.equal(p.accept(0).kind,'same');
assert.equal(p.accept(1).kind,'press');
assert.equal(p.accept(1).kind,'same');
assert.equal(p.accept(0).kind,'release');
assert.equal(p.accept(0).kind,'same');
assert.equal(p.accept(1).kind,'press');
assert.equal(p.accept(0).kind,'release');
assert.equal(p.edges,2);
assert.equal(p.releases,2);
assert.equal(p.accept(2).kind,'invalid');
assert.equal(p.edges,2);
p.reset();
assert.equal(p.accept(1).kind,'baseline'); // no false point from initial cached value
assert.equal(p.edges,0);
console.log('Pulse tracker: all tests passed.');
