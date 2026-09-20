# Reference material and provenance

## Requested product category

- Universe Sandbox official product description: https://universesandbox.com/
- The shared ChatGPT page provided with the request exposed its title, “App Cloning Ideas,” but not the discussion text in the available reader. The implementation therefore follows the explicit Orbitarium / HTML / JavaScript / WebGPU / reusable-package brief, not an assumed hidden specification.

Orbitarium's source, shaders, interface, icon paths and procedural visuals are original to this implementation. No proprietary engine code, textures, saved simulations, measured planetary maps or commercial UI assets are included. There is no representation of affiliation or proprietary file/protocol compatibility.

## Physical parameter reference

- NASA/JPL Solar System Dynamics, planetary physical parameters: https://ssd.jpl.nasa.gov/planets/phys_par.html

Catalog values are intentionally rounded and stored directly in `packages/celestial/src/index.js`. Orbital elements and phases are simplified illustrative initial conditions. The app does not request ephemerides, download a catalog at runtime, or promise present-day planetary positions. Mixture densities, greenhouse offsets, thermal response times, fragment energy/size choices and galaxy-preset scales are model parameters rather than sourced measurements.

## GPU specifications

- W3C WebGPU specification: https://www.w3.org/TR/webgpu/
- W3C WGSL specification: https://www.w3.org/TR/WGSL/

The WGSL arithmetic and workgroup/storage model informed kernel implementation. Reading the specification is not a substitute for driver/compiler testing; actual WebGPU execution was unavailable in the delivered build environment and is marked accordingly in the test report.
