# Autopilot Implementation Plan

1. Expand `analysis.py` to emit dashboard-ready summary, note, folder, and delta series.
2. Add regression tests for new aggregates and summary fields.
3. Add dashboard static assets under `dashboard/` using plain HTML/CSS/JS + ECharts.
4. Add a generated local artifact path (e.g. `out/dashboard.html`) from the CLI build flow.
5. Update README with dashboard usage.
6. Run py_compile, unittest suite, and end-to-end build to verify JSON + chart + dashboard output.
