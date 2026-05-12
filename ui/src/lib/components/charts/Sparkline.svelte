<script lang="ts">
let {
  data = [],
  width = 80,
  height = 24,
  stroke = 'currentColor',
  fill = 'none',
  strokeWidth = 1.5,
}: {
  data: number[];
  width?: number;
  height?: number;
  stroke?: string;
  fill?: string;
  strokeWidth?: number;
} = $props();

let path = $derived.by(() => {
  if (!data.length) return '';
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const stepX = data.length > 1 ? width / (data.length - 1) : 0;
  return data
    .map((v, i) => {
      const x = i * stepX;
      const y = height - ((v - min) / range) * (height - 2) - 1;
      return (i === 0 ? 'M' : 'L') + x.toFixed(1) + ',' + y.toFixed(1);
    })
    .join(' ');
});

let areaPath = $derived.by(() => {
  if (!data.length || fill === 'none') return '';
  return path + ' L' + width + ',' + height + ' L0,' + height + ' Z';
});
</script>

<svg {width} {height} class="overflow-visible" viewBox={'0 0 ' + width + ' ' + height} preserveAspectRatio="none">
  {#if fill !== 'none' && areaPath}
    <path d={areaPath} {fill} opacity="0.2" />
  {/if}
  {#if path}
    <path d={path} {stroke} stroke-width={strokeWidth} fill="none" stroke-linecap="round" stroke-linejoin="round" />
  {/if}
</svg>
