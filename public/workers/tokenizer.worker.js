// Tokenizer Web Worker
// Offloads token counting to a separate thread to prevent UI lag
// Falls back to heuristic estimation if tokenizer library is unavailable

self.onmessage = function(e) {
  if (e.data.type === 'count') {
    var text = e.data.text || '';
    var count = estimateTokens(text);
    self.postMessage({ type: 'result', count: count });
  }
};

function estimateTokens(text) {
  var count = 0;
  for (var i = 0; i < text.length; i++) {
    var code = text.codePointAt(i);
    // CJK Unified Ideographs
    if (code >= 0x4e00 && code <= 0x9fff) {
      count += 0.5;
    } else {
      count += 0.25;
    }
    // Handle surrogate pairs
    if (code > 0xffff) i++;
  }
  return Math.ceil(count);
}

// Signal ready
self.postMessage({ type: 'ready' });
