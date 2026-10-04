import json
from pathlib import Path
import subprocess
import tempfile
import unittest
import xml.etree.ElementTree as ET
from datetime import datetime

from obsidian_word_history.render import build_axis_layout, render_chart_svg

NS = {"svg": "http://www.w3.org/2000/svg"}


class ChartLayoutTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.cases = json.loads(Path("tests/chart_cases.json").read_text())
        cls.temp = tempfile.TemporaryDirectory()
        cls.bundle = Path(cls.temp.name) / "chart.cjs"
        subprocess.run(["node_modules/.bin/esbuild", "src/chart.ts", "--bundle", "--platform=node", "--format=cjs", f"--outfile={cls.bundle}"], check=True, capture_output=True)

    @classmethod
    def tearDownClass(cls):
        cls.temp.cleanup()

    def test_javascript_and_python_share_calendar_layout_and_svg_geometry(self):
        for case in self.cases:
            for width in (360, 780, 1200):
                with self.subTest(case=case["name"], width=width):
                    options = {key: case[key] for key in ("timeZone", "milestoneMonth") if key in case}
                    analysis = {"commit_trend": [{"timestamp": case["start"], "total_words": 100}, {"timestamp": case["end"], "total_words": 410000}]}
                    source = "const c=require(process.argv[1]);const p=JSON.parse(process.argv[2]);console.log(JSON.stringify({layout:c.buildAxisLayout(Date.parse(p.start),Date.parse(p.end),p.width-100,p.options),svg:c.renderChartSvg(p.analysis,p.width,p.options)}));"
                    js = json.loads(subprocess.run(["node", "-e", source, str(self.bundle), json.dumps({**case, "width": width, "options": options, "analysis": analysis})], check=True, capture_output=True, text=True).stdout)
                    start = datetime.fromisoformat(case["start"].replace("Z", "+00:00")).timestamp()
                    end = datetime.fromisoformat(case["end"].replace("Z", "+00:00")).timestamp()
                    py = build_axis_layout(start, end, width - 100, milestone_month=case.get("milestoneMonth"), time_zone=case["timeZone"])
                    self.assertEqual(js["layout"]["startLabel"], py.start_label)
                    self.assertEqual(js["layout"]["endLabel"], py.end_label)
                    self.assertEqual(js["layout"]["intervalMonths"], py.interval_months)
                    self.assertEqual(js["layout"]["stackedRange"], py.stacked_range)
                    self.assertEqual([tick["label"] for tick in js["layout"]["ticks"]], [tick.label for tick in py.ticks])
                    for actual, expected in zip(js["layout"]["ticks"], py.ticks):
                        self.assertAlmostEqual(actual["timestamp"] / 1000, expected.timestamp)
                        self.assertAlmostEqual(actual["x"], expected.x)
                    if py.milestone:
                        actual = js["layout"]["milestone"]
                        self.assertEqual(actual["kind"], py.milestone.kind)
                        self.assertEqual(actual["label"], py.milestone.label)
                        if py.milestone.kind == "inside":
                            self.assertAlmostEqual(actual["x"], py.milestone.x)
                            self.assertAlmostEqual(actual["labelX"], py.milestone.label_x)
                    svg = render_chart_svg(analysis, width=width, milestone_month=case.get("milestoneMonth"), time_zone=case["timeZone"])
                    self.assertEqual(self._geometry(js["svg"]), self._geometry(svg))
                    xml = ET.fromstring(svg)
                    texts = [node.text for node in xml.findall(".//svg:text", NS)]
                    self.assertIn(py.start_label, texts)
                    self.assertIn(py.end_label, texts)
                    self.assertIn("500K", texts)
                    if start == end:
                        self.assertFalse(py.ticks)
                        self.assertEqual(xml.find('.//svg:circle', NS).attrib['cx'], f"{(width - 100) / 2:.2f}")
                    marker = xml.find('.//svg:line[@class="milestone-line"]', NS)
                    if py.milestone and py.milestone.kind == "inside":
                        self.assertEqual(marker.attrib["x1"], f"{py.milestone.x:.2f}")
                    else:
                        self.assertIsNone(marker)

    @staticmethod
    def _geometry(svg):
        root = ET.fromstring(svg)
        return [(element.tag, dict(element.attrib), element.text) for element in root.iter() if not element.tag.endswith(("defs", "style"))]

    def test_exact_expected_timezone_dates_and_quarter_ticks(self):
        start = datetime.fromisoformat("2025-06-30T20:00:00+00:00").timestamp()
        end = datetime.fromisoformat("2025-07-01T01:00:00+00:00").timestamp()
        layout = build_axis_layout(start, end, 680, milestone_month="2025-07", time_zone="Asia/Shanghai")
        self.assertEqual((layout.start_label, layout.end_label), ("Start 2025-07-01", "End 2025-07-01"))
        self.assertEqual(layout.milestone.kind, "outside")

    def test_invalid_options_and_width_are_rejected(self):
        for month in ("2025-13", "July 2025", "0000-07"):
            with self.assertRaises(ValueError):
                render_chart_svg({"commit_trend": []}, milestone_month=month)
        with self.assertRaises(ValueError):
            render_chart_svg({"commit_trend": []}, width=359)

    def test_javascript_rejects_local_timestamps_and_bad_options(self):
        source = "const c=require(process.argv[1]);let failed=0;for(const [a,w,o] of [[{commit_trend:[{timestamp:'2025-07-01T00:00:00',total_words:1}]},780,{}],[{commit_trend:[]},359,{}],[{commit_trend:[]},780,{milestoneMonth:'2025-13'}],[{commit_trend:[]},780,{timeZone:'Invalid/Zone'}]]){try{c.renderChartSvg(a,w,o)}catch{failed++}}console.log(failed);"
        result = subprocess.run(["node", "-e", source, str(self.bundle)], check=True, capture_output=True, text=True)
        self.assertEqual(result.stdout.strip(), "4")
