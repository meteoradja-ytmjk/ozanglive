class ProcessingQueue {
  constructor({ concurrency = 1, name = 'processing-queue' } = {}) {
    this.concurrency = Math.max(1, Number(concurrency) || 1);
    this.name = name;
    this.queue = [];
    this.activeCount = 0;
  }

  add(task) {
    return new Promise((resolve, reject) => {
      this.queue.push({ task, resolve, reject });
      this.processNext();
    });
  }

  processNext() {
    while (this.activeCount < this.concurrency && this.queue.length > 0) {
      const { task, resolve, reject } = this.queue.shift();
      this.activeCount += 1;

      Promise.resolve()
        .then(task)
        .then(resolve)
        .catch(reject)
        .finally(() => {
          this.activeCount -= 1;
          this.processNext();
        });
    }
  }
}

module.exports = ProcessingQueue;
