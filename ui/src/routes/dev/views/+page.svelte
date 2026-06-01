<!--
  /dev/views route — opens the dev gallery DRAWER (DevGalleryDrawer). The
  gallery itself is a bottom drawer (Sheet side="bottom") so it slides up and
  dismisses on Esc / backdrop. Navigating here mounts it open; closing it
  navigates home. The
  floating flask launcher in the root layout opens the SAME drawer in place
  (without a route change).
-->
<script lang="ts">
  import { goto } from '$app/navigation';
  import DevGalleryDrawer from './DevGalleryDrawer.svelte';

  let open = $state(true);
</script>

<DevGalleryDrawer bind:open onClose={() => void goto('/')} />
