# Deploy status action

## What is this?
GitHub Action that blocks all deploys based upon an issue being raised with the "block deploys" label. If someone would want to override the deploy, they would simply title their PR with "emergency deploy" label. This will unblock that specific PR.

Here is an example of [workflow](https://github.com/simplybusiness/deploy-status-action/blob/master/example/workflows/deploy_action.yml) you can use to set up your repository

