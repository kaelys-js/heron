<script lang="ts">
  // Dev-only helper for the view gallery: throws during render so the
  // layout's <svelte:boundary> page-crash UI can be previewed. Throwing in
  // the script body happens synchronously at render time, which is exactly
  // the class of error the boundary catches.
  throw new Error('Preview: a component threw during render — caught by the page error boundary.');
</script>
