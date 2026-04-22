
export function createTimerWorker() {
  const blob = new Blob([`
    let interval = null;
    self.onmessage = function(e) {
      if (e.data.action === 'start') {
        if (interval) clearInterval(interval);
        interval = setInterval(() => {
          self.postMessage('tick');
        }, e.data.ms || 500);
      } else if (e.data.action === 'stop') {
        if (interval) clearInterval(interval);
        interval = null;
      }
    };
  `], { type: 'application/javascript' });
  return new Worker(URL.createObjectURL(blob));
}
