import katex from 'katex';

self.onmessage = (event) => {
  const { type, latex, id } = event.data;

  if (type === 'RENDER_LATEX') {
    try {
      const htmlWithSvg = katex.renderToString(latex, {
        output: 'html',
        throwOnError: false,
        // Add any other KaTeX options you might need here, for example:
        // displayMode: true, // for display style math
        // fleqn: true, // to make display math flush left
        // macros: { "\\RR": "\\mathbb{R}" } // custom macros
      });
      self.postMessage({ type: 'RENDER_RESULT', id, svg: htmlWithSvg, error: null });
    } catch (e: any) {
      self.postMessage({ type: 'RENDER_RESULT', id, svg: null, error: e.message });
    }
  }
};

// Export {} to make it a module, to satisfy TypeScript if 'isolatedModules' is on.
// This is a common pattern for web workers written in TypeScript.
export {}; 