# deploy-status-action
GitHub Action that blocks all the deploy based upon an issue being raised with the "block deploys" label. If someone would want to override the deploy, they would simply title their PR with `emergency deploy` label. This will unblock that specific PR.
