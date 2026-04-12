import { JSDOM } from 'jsdom';
import { readFile, writeFile } from 'node:fs/promises';
import process from 'node:process';
import XYChart from '../shared/packages/xy-chart.tsx';

type CommitTrendRow = {
  timestamp: string;
  total_words: number;
};

type Analysis = {
  commit_trend: CommitTrendRow[];
};

function parseArgs(argv: string[]) {
  const args = new Map<string, string>();
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token.startsWith('--')) {
      args.set(token, argv[i + 1] ?? '');
      i += 1;
    }
  }
  return args;
}

function recommendedWidth(commitCount: number): number {
  return Math.min(1600, Math.max(900, 900 + Math.max(0, commitCount - 365)));
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const inputPath = args.get('--input');
  const outputPath = args.get('--output');
  const widthArg = args.get('--width');

  if (!inputPath || !outputPath) {
    throw new Error('Usage: tsx render-word-history.ts --input <analysis.json> --output <chart.svg> [--width <n>]');
  }

  const analysis = JSON.parse(await readFile(inputPath, 'utf-8')) as Analysis;
  const width = widthArg ? Number(widthArg) : recommendedWidth(analysis.commit_trend.length);
  const dom = new JSDOM(`<!DOCTYPE html><body><svg xmlns="http://www.w3.org/2000/svg" width="${width}"></svg></body>`, {
    contentType: 'text/html',
  });
  const svg = dom.window.document.querySelector('svg') as unknown as SVGSVGElement | null;
  if (!svg) throw new Error('Failed to create SVG root');

  XYChart(
    svg,
    {
      title: 'Word History',
      xLabel: '',
      yLabel: 'Words',
      data: {
        datasets: [
          {
            label: 'Total Words',
            logo: '',
            data: analysis.commit_trend.map((row) => ({ x: row.timestamp, y: row.total_words })),
          },
        ],
      },
      showDots: false,
      transparent: false,
    },
    {
      envType: 'node',
      xTickLabelType: 'Date',
      legendPosition: 'top-left',
      chartWidth: width,
    },
  );

  const root = dom.window.document.querySelector('svg');
  if (!root) throw new Error('Rendered SVG missing');

  decorateXAxis(root, analysis.commit_trend);
  root.querySelectorAll('image').forEach((node) => node.remove());
  root.querySelectorAll('svg').forEach((node) => {
    const style = node.getAttribute('style') || '';
    if (style.includes('visibility: hidden')) node.remove();
  });
  root.querySelectorAll('text').forEach((node) => {
    const text = node.textContent?.trim();
    if (text === 'Date' || text === 'star-history.com') node.remove();
  });

  await writeFile(outputPath, root.outerHTML + '\n', 'utf-8');
}

function decorateXAxis(root: SVGSVGElement, commitTrend: CommitTrendRow[]) {
  if (commitTrend.length === 0) return;

  const xAxis = root.querySelector('.xaxis');
  if (!xAxis) return;

  const domainPath = xAxis.querySelector('.domain');
  if (!domainPath) return;
  const domain = domainPath.getAttribute('d') || '';
  const match = domain.match(/H([0-9.]+)/);
  const chartWidth = match ? Number(match[1]) - 0.5 : 0;
  if (!Number.isFinite(chartWidth) || chartWidth <= 0) return;

  const ticks = Array.from(xAxis.querySelectorAll<SVGGElement>('.tick'));
  const firstDate = new Date(commitTrend[0].timestamp);
  const lastDate = new Date(commitTrend[commitTrend.length - 1].timestamp);
  const minSpacing = 120;

  for (const tick of ticks) {
    const x = extractTickX(tick);
    if (x === null) continue;
    if (x < minSpacing || chartWidth - x < minSpacing) {
      tick.remove();
    }
  }

  appendTick(xAxis as SVGGElement, 0, formatFullDate(firstDate), 'start');
  appendTick(xAxis as SVGGElement, chartWidth, formatFullDate(lastDate), 'end');

  const boundaryYears = buildInteriorYearBoundaries(firstDate, lastDate);
  for (const { date, x } of boundaryYears.map((date) => ({ date, x: scaleDate(date, firstDate, lastDate, chartWidth) }))) {
    const nearExisting = Array.from(xAxis.querySelectorAll<SVGGElement>('.tick')).some((tick) => {
      const tickX = extractTickX(tick);
      return tickX !== null && Math.abs(tickX - x) < 90;
    });
    if (!nearExisting) {
      appendTick(xAxis as SVGGElement, x, String(date.getFullYear()), 'middle');
    } else {
      for (const tick of Array.from(xAxis.querySelectorAll<SVGGElement>('.tick'))) {
        const tickX = extractTickX(tick);
        if (tickX !== null && Math.abs(tickX - x) < 30) {
          const text = tick.querySelector('text');
          if (text) text.textContent = String(date.getFullYear());
        }
      }
    }
  }
}

function appendTick(axis: SVGGElement, x: number, label: string, anchor: 'start' | 'middle' | 'end') {
  const tick = axis.ownerDocument.createElementNS('http://www.w3.org/2000/svg', 'g');
  tick.setAttribute('class', 'tick');
  tick.setAttribute('opacity', '1');
  tick.setAttribute('transform', `translate(${x.toFixed(2)},0)`);

  const line = axis.ownerDocument.createElementNS('http://www.w3.org/2000/svg', 'line');
  line.setAttribute('stroke', 'currentColor');
  line.setAttribute('y2', '0');
  tick.appendChild(line);

  const text = axis.ownerDocument.createElementNS('http://www.w3.org/2000/svg', 'text');
  text.setAttribute('fill', 'currentColor');
  text.setAttribute('y', '6');
  text.setAttribute('dy', '0.71em');
  text.setAttribute('text-anchor', anchor);
  text.setAttribute('style', 'font-family: xkcd; font-size: 16px; fill: black;');
  text.textContent = label;
  tick.appendChild(text);

  axis.appendChild(tick);
}

function extractTickX(tick: SVGGElement): number | null {
  const transform = tick.getAttribute('transform') || '';
  const match = transform.match(/translate\(([-0-9.]+),0\)/);
  return match ? Number(match[1]) : null;
}

function formatFullDate(date: Date): string {
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: '2-digit',
    year: 'numeric',
  }).replace(/,/, ',');
}

function buildInteriorYearBoundaries(start: Date, end: Date): Date[] {
  const years: Date[] = [];
  for (let year = start.getFullYear() + 1; year <= end.getFullYear(); year += 1) {
    const jan1 = new Date(Date.UTC(year, 0, 1));
    if (jan1 > start && jan1 < end) years.push(jan1);
  }
  return years;
}

function scaleDate(value: Date, start: Date, end: Date, width: number): number {
  const total = end.getTime() - start.getTime();
  if (total <= 0) return 0;
  return ((value.getTime() - start.getTime()) / total) * width;
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
