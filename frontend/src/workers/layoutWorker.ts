import ELK from 'elkjs/lib/main'; // Node-style build (runs algorithms in current thread but expects a Worker impl)
import WebWorker from 'web-worker'; // Polyfill that works in both main thread and Web Worker contexts

// Elkjs layout options (can be customized based on needs)
const elkOptions = {
  'elk.algorithm': 'layered', // Example: layered, mrtree, force, etc.
  'elk.direction': 'DOWN',
  'elk.spacing.nodeNode': '40',
  'elk.layered.spacing.nodeNodeBetweenLayers': '60',
  // Add other ELK options here: https://www.eclipse.org/elk/reference/options.html
};

// Path to the worker script that ships with elkjs. We resolve it relative to the current file so
// the bundler (Next.js / webpack) copies it correctly into the build output.
let elkWorkerUrl = new URL('elkjs/lib/elk-worker.min.js', import.meta.url).toString();
// Next.js may rewrite URLs to start with "/_next/static" without an origin; WebWorker
// requires an absolute URL. If the generated path is root-relative, prefix it with the
// current origin (self.location.origin works in both Window and Worker contexts).
if (elkWorkerUrl.startsWith('/')) {
  // eslint-disable-next-line no-restricted-globals
  elkWorkerUrl = self.location.origin + elkWorkerUrl;
}

// Instantiate ELK and let it create *its own* inner Worker using the script above. Nested workers
// are supported by modern browsers and avoid the "postMessage of undefined" issue we just saw.
// We explicitly pass a `workerFactory` so that the Node-flavoured fallback inside `elkjs/lib/main`
// isn't used.
const elk = new ELK({
  // Provide our own factory that ignores the incoming url (ELK will pass undefined) and points to
  // the resolved worker script path. Using `web-worker` makes this work in both Node and browser
  // contexts, including from within an existing Web Worker.
  workerFactory: () => new WebWorker(elkWorkerUrl),
});

self.onmessage = async (event) => {
  const { type, nodes: inputNodes, edges: inputEdges, layoutType, id } = event.data;
  // Map generic or unsupported layout identifiers to concrete ELK algorithms.
  const resolvedAlgorithm = !layoutType || layoutType === 'elk' ? 'layered' : layoutType;

  if (type === 'LAYOUT_GRAPH') {
    if (!inputNodes || !inputEdges) {
      self.postMessage({ type: 'LAYOUT_RESULT', id, positions: null, error: 'Nodes or edges not provided to layout worker.' });
      return;
    }

    // Transform input nodes and edges to ELK graph structure
    const elkGraph = {
      id: 'root',
      layoutOptions: { ...elkOptions, 'elk.algorithm': resolvedAlgorithm },
      children: inputNodes.map((node: any) => ({
        id: node.id,
        width: node.width || 150, // Default width if not provided
        height: node.height || 50, // Default height if not provided
        // labels: node.label ? [{ text: node.label }] : [], // ELK can handle labels too
        // layoutOptions: { 'elk.portConstraints': 'FIXED_ORDER' } // Example node-specific option
      })),
      edges: inputEdges.map((edge: any) => ({
        id: edge.id,
        sources: [edge.source], // ELK expects source/target IDs in arrays
        targets: [edge.target],
        // labels: edge.label ? [{ text: edge.label }] : [],
      })),
    };

    try {
      const layout = await elk.layout(elkGraph);
      const positions: { [nodeId: string]: { x: number; y: number } } = {};
      
      if (layout.children) {
        layout.children.forEach((node: any) => {
          positions[node.id] = { x: node.x || 0, y: node.y || 0 };
        });
      }
      // ELK might also return positions for edges/ports if configured, handle if needed.

      self.postMessage({ type: 'LAYOUT_RESULT', id, positions, error: null });
    } catch (e: any) {
      console.error('[LayoutWorker] ELK layout error:', e);
      self.postMessage({ type: 'LAYOUT_RESULT', id, positions: null, error: e.message || 'Unknown ELK layout error' });
    }
  }
};

// Export {} to make it a module for TypeScript if isolatedModules is on.
export {}; 