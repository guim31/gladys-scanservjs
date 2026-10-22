// -----------------------------------------------------------------------------
// Scene action handlers (manifest `scene_actions`, Gladys 5.1+).
//
// "Scan" starts a preset of the configuration and waits for the file, up to
// 100 seconds from its start (the action has 120): its outputs then name the file and its
// pages for the next actions ("send me a message"). A longer scan (a full
// document feeder) goes on: `done` is false, and "A scan is done" fires at its
// end.
//
// "Delete the last file" is off by default (configuration): a scene, a voice
// assistant or another user of Gladys then cannot delete a document.
// -----------------------------------------------------------------------------

export const SCAN_WAIT_MS = 100_000;

/**
 * The outcome of `promise` within `ms`: its value, or `null` when it is still
 * running (it goes on; its rejection is then the hub's business, not ours).
 */
export async function within(promise, ms) {
  let timer;
  const late = new Promise((resolve) => {
    timer = setTimeout(() => resolve(null), ms);
  });
  promise.catch(() => {});
  try {
    return await Promise.race([promise, late]);
  } finally {
    clearTimeout(timer);
  }
}

export const SCENE_ACTIONS = {
  async start_scan(hub, { fields = {} }, { waitMs = SCAN_WAIT_MS } = {}) {
    // The wait counts from the action: reading scanservjs first takes some.
    const started = Date.now();
    const { done } = await hub.startScan({ preset: fields.preset, device: fields.device });
    const result = await within(done, Math.max(0, waitMs - (Date.now() - started)));
    return result
      ? { done: true, file: result.file, pages: result.pages }
      : { done: false, file: '', pages: 0 };
  },

  async delete_last_file(hub) {
    return { file: await hub.deleteLastFile() };
  },
};
