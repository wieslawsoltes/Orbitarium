# @orbitarium/gpu

WebGPU device, validation, tiled integration and buffer lifecycle. Original ES-module implementation, MIT licensed, version 0.1.0.

## Exports

createGPUDevice, checkedModule, GPUGravity.

## Consumption

This is an independently packaged library. Its package.json declares all sibling dependencies. The application consumes this same package through its import map. Use npm workspaces from the repository root, or install all required local archives in release/packages together. No public-registry publication is asserted.

```js
import * as orbitarium from '@orbitarium/gpu';
```

Units are AU, days, nominal solar masses and kelvin unless explicitly named otherwise. Follow the documented ownership rules; numerical arrays are mutable solver state. See the repository docs/API.md, docs/ARCHITECTURE.md and docs/SCIENCE.md for contracts, equations and limitations. The build environment did not expose an eligible WebGPU device; GPU runtime validation is explicitly not claimed.
