<!--
  Harness wrapper for ResponsiveActionMenu. testing-library/svelte v5
  doesn't have a clean snippet-prop API; instantiate a real Svelte
  component that supplies the snippets so the consumer test renders
  this and then asserts on the resulting DOM.
-->
<script lang="ts">
  import ResponsiveActionMenu from '../ResponsiveActionMenu.svelte';
  import ResponsiveActionItem from '../ResponsiveActionItem.svelte';

  type Props = {
    open?: boolean;
    title?: string;
    description?: string;
  };
  let { open = $bindable(false), title = 'Test menu', description }: Props = $props();
</script>

<ResponsiveActionMenu bind:open {title} {description}>
  {#snippet trigger({ props }: { props: Record<string, unknown> })}
    <button {...props} data-testid="harness-trigger">Open</button>
  {/snippet}
  {#snippet items()}
    <ResponsiveActionItem onSelect={() => {}}>One</ResponsiveActionItem>
    <ResponsiveActionItem onSelect={() => {}}>Two</ResponsiveActionItem>
  {/snippet}
</ResponsiveActionMenu>
