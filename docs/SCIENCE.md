# Numerical and scientific model

This document describes the implemented equations and their boundaries, not the proprietary internals of any other product. Orbitarium is an exploratory Newtonian sandbox, not an ephemeris, impact-hydrodynamics or climate prediction service.

## Units and gravity

The storage units are astronomical units, days and nominal solar masses. `AU_KM = 149597870.7`, `DAY_S = 86400`, `SOLAR_KG = 1.98847e30`, and the adopted solar gravitational parameter in these normalized units is `G = 0.0002959122082855911`. Mass/radius catalog entries are rounded, and independently rounded SI conversion constants are not an assertion of metrological precision.

For body i, the implemented softened force law is

```
a_i = G * gravityMultiplier * sum(j != i,
      mass_j * (position_j-position_i)
      / (|position_j-position_i|^2 + epsilon^2)^(3/2))
```

The same softening convention appears in mechanical energy diagnostics. In direct mode, each pair contributes to both bodies, avoiding asymmetric source ordering. Barnes–Hut approximates sufficiently distant octree nodes by their mass and center of mass; its opening criterion compares node width over distance with theta. It is a monopole approximation, not an exact multipole expansion, and need not preserve total linear momentum exactly.

Integration uses

```
v_half = v_n + acceleration(position_n) * dt/2
position_(n+1) = position_n + v_half * dt
v_(n+1) = v_half + acceleration(position_(n+1)) * dt/2
```

With a fixed timestep and a conservative force field this is the familiar time-reversible second-order leapfrog construction. Adaptive stepping, approximated forces, collisions, manual edits and thermal processes change its global conservation properties. The numerical test suite verifies a specific fixed-step two-body orbit to a tight energy tolerance; that test is not a universal accuracy guarantee.

The limiter uses a fraction of pair dynamical time and relative crossing time, with a minimum step of 1e-8 days. Major-major and tracer-major encounters constrain it; tracer-tracer encounters do not. It is an accuracy heuristic rather than local-error-controlled adaptive integration. Maximum requested rate may be reduced and is labeled in the UI. Zero gravity produces free motion subject to crossing/step limits.

## Initial orbits and analysis

`keplerState` creates a bound ellipse at a specified true anomaly and rotates it by inclination and ascending node. The UI's orbital radius field is explicitly the semi-major axis, not necessarily instantaneous radius. Parent position and velocity are added to the relative state. Initial orbital velocity is scaled when the user changes the gravity multiplier.

Rendered orbit ellipses and inspector elements are **osculating two-body approximations**, using an automatically chosen more massive primary. They are not future integrated trajectories under the complete N-body force field. Actual trails are recorded separately. Escape/hyperbolic motion remains physically integrated even though the orbit-overlay implementation omits hyperbolic curves. Preset solar-system phases are illustrative and not dated astronomical ephemerides.

## Collisions

Collision broad phase sorts swept x-extents; narrow phase checks minimum separation between linearly interpolated endpoint paths. Physical radii, not display radii, determine contact. A body participates in at most one resolved pair per boundary. This is not a globally time-ordered continuous collision solver, and a long curved path cannot be reconstructed from its endpoints.

Merging replaces two bodies with their mass-weighted center and velocity:

```
M = m_a + m_b
P = (m_a*p_a + m_b*p_b) / M
V = (m_a*v_a + m_b*v_b) / M
R = cbrt(r_a^3 + r_b^3)
```

Mass, linear momentum, center of mass and spherical volume are retained to floating-point error. The more massive body's stable identity survives. Composition and heat capacity are mass-weighted, and luminosity is summed. Orbital angular momentum of the two bodies is **not** transferred into a fully simulated internal spin state. Deformation, vapor escape, shock waves and pressure-dependent equations of state are not implemented.

The relative kinetic energy lost in a perfectly inelastic merger is converted into a lumped temperature increase through mass-weighted specific heat. This is a pedagogical approximation with a numerical temperature cap, not a calibrated impact model. Mechanical energy diagnostics properly show changes from dissipative mergers.

Elastic mode applies a restitution-one normal impulse. For complete endpoint crossings, contact normal is evaluated at the estimated segment entry time, not at the reversed post-crossing separation. Remaining linear travel is reflected consistently and penetration is corrected. The impulse preserves kinetic energy and linear momentum in its ideal sphere model; positional corrections and gravity still mean total mechanical energy need not be exact.

Explicit **Explode** is a sandbox editing command. It retains a configurable remnant, splits ejecta into equal masses, generates seeded directions and subtracts their mean to preserve center of mass and net momentum. Position and velocity offsets are radially aligned. Input validation is completed before changing the store. This operation deliberately injects kinetic/thermal energy and uses illustrative debris sizes: it is neither an energy-conserving physical explosion nor a stellar-evolution prediction. All created fragments are subsequently integrated as finite-mass bodies.

## Temperature and materials

The equilibrium temperature implementation uses a zero-dimensional radiative estimate:

```
T_target = [2.725^4 + 278.329^4 * (1-albedo)
            * sum(stars, luminositySolar / distanceAU^2)]^(1/4)
           + greenhouseOffset
T_new = T_target + (T_old-T_target) * exp(-dt/thermalDays)
```

Distances are protected against the singularity of a body at a luminous source. This is bounded exponential relaxation toward a target, not a spatial energy-transport solution. Stars retain their assigned temperatures/luminosities instead of undergoing time evolution. Changing mass does not automatically evolve a stellar lifetime or luminosity.

Surface colors and state labels respond approximately to temperature. There is no pressure-dependent phase diagram, evaporation mass loss, ocean circulation, cloud microphysics, terrain diffusion or global climate model. The greenhouse control is an additive kelvin offset. The habitable overlay scales fixed illustrative inner/outer radii by square root of luminosity; it is not a habitability determination.

Material fractions are iron, rock, water and a coarse hydrogen-rich category. Density-derived radius uses a fixed specific-volume mixture of illustrative component densities. It is not an equation of state; real planets compress, differentiate and vary strongly with pressure and temperature. Material changes only alter radius when the explicit derivation command is used, avoiding hidden changes to collision geometry.

## Visual versus physical representation

Normal display mode exaggerates body sizes. Physical-radii mode still draws small point markers so subpixel bodies can be found. Neither mode changes mass, position, acceleration or actual collision radius. Ring flags draw decoration. The ring-laboratory scenario separately contains 900 integrated finite-mass particles. These are idealized numerical particles rather than measured individual ice fragments.

Surfaces are procedural illustrations. Black holes use Newtonian gravity with a small sphere capture radius and an illustrative accretion appearance. There is no relativistic metric, gravitational lensing, ray-traced photon sphere or cosmological expansion. The galaxy scenario uses two compact central potentials and finite-mass disk particles at deliberately illustrative scales.

## Reproducibility and intended interpretation

Initial states and fragment directions are seeded. Fixed CPU stepping is reproducible for a given runtime and operation sequence to normal floating-point expectations. Real-time stepping depends on frame timing; Barnes–Hut changes approximation topology; GPU Float32 arithmetic and transcendental functions need not match across devices. Export snapshots to preserve exact committed state, and use fixed reference-step tests for numerical investigations.

Appropriate use: interactive gravity experiments, qualitative orbital dynamics, software-engine experimentation, and educational visualization with these caveats. Not appropriate as delivered: mission navigation, scientific impact forecasts, dated sky predictions or quantitative long-term climate predictions.
