// Read a JSON data file from a module that runs on the server (Node) AND in the browser (a phone's practice round
// imports the minigame's sim.js). Never `import … with { type: 'json' }`: import attributes killed the live site on
// Steam Deck browsers (lessons-from-games rule 38). Use with top-level await:
//   const FILE = await loadJson(new URL('../../../data/scenes.json', import.meta.url));
export async function loadJson(url) {
  if (typeof window === 'undefined' && typeof process !== 'undefined' && process.versions?.node) {
    const { readFile } = await import('node:fs/promises');
    return JSON.parse(await readFile(url, 'utf8'));
  }
  return (await fetch(url)).json();
}
