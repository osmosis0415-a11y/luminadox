'use strict';

const wasmUrl = 'https://raw.githubusercontent.com/hlotiim/privacy-first-pdf-protector-set-password-in-pdf-free-locally/b3938ae17a49cfec683e9b540bdc3f74dc7df359/vendor/qpdf.wasm';

self.onmessage = async ({ data }) => {
  const { bytes, password } = data;
  if (!password || password.includes('\0')) {
    self.postMessage({ error: 'Enter the current PDF password.' });
    return;
  }

  let qpdf;
  try {
    importScripts('./vendor/qpdf-0.3.0.js');
    qpdf = await self.Module({ locateFile: () => wasmUrl });
  } catch {
    self.postMessage({ error: 'Could not load the PDF engine. Connect to the internet and try again.' });
    return;
  }

  try {
    qpdf.FS.writeFile('/input.pdf', new Uint8Array(bytes));
    const status = qpdf.callMain(['--password=' + password, '--decrypt', '/input.pdf', '/output.pdf']);
    if (![0, 3].includes(status)) throw new Error('Password removal failed');
    const output = qpdf.FS.readFile('/output.pdf').slice();
    self.postMessage({ output }, [output.buffer]);
  } catch {
    self.postMessage({ error: 'Check the password and confirm the file opens in a PDF reader.' });
  }
};
