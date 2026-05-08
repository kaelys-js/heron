/**
 * Client-side store for global UI surfaces invoked from anywhere
 * (currently from the sidebar): the Search palette and the New Apply dialog.
 */

class GlobalActionsStore {
  searchOpen = $state(false);
  addJobOpen = $state(false);

  openSearch() { this.searchOpen = true; }
  closeSearch() { this.searchOpen = false; }
  toggleSearch() { this.searchOpen = !this.searchOpen; }

  openAddJob() { this.addJobOpen = true; }
  closeAddJob() { this.addJobOpen = false; }
}

export const globalActions = new GlobalActionsStore();
