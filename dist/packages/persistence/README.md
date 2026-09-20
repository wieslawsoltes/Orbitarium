# @orbitarium/persistence

Versioned validated projects and browser storage. Original ES-module implementation, MIT licensed, version 0.1.0.

## Exports

MAX_FILE_BYTES, validateProject, parseProject, stringifyProject, downloadBlob, ProjectLibrary.

## Consumption

This is an independently packaged library. Its package.json declares all sibling dependencies. The application consumes this same package through its import map. Use npm workspaces from the repository root, or install all required local archives in release/packages together. No public-registry publication is asserted.

```js
import * as orbitarium from '@orbitarium/persistence';
```

Units are AU, days, nominal solar masses and kelvin unless explicitly named otherwise. Follow the documented ownership rules; numerical arrays are mutable solver state. See the repository docs/API.md, docs/ARCHITECTURE.md and docs/SCIENCE.md for contracts, equations and limitations. The build environment did not expose an eligible WebGPU device; GPU runtime validation is explicitly not claimed.
