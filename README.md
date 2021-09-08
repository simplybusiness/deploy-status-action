# Deploy status action

## What is this?
GitHub Action that blocks all deploys based upon an issue being raised with the "block deploys" label. If someone would want to override the deploy, they would simply title their PR with "emergency deploy" label. This will unblock that specific PR.

## Installation

1. Create a file called .github/workflows/deploy-status.yml in your repository with the following YAML (modify as instructed in the comments):

    ```yaml
    name: Deploy Status
    
    on:
     pull_request:
       branches:
         - master
       types: [opened, labeled, synchronize]
     issues:
       types: [labeled, closed]
    
    jobs:
     build:
       runs-on: ubuntu-latest
       steps:
         - name: Deploy Status Action
           uses: simplybusiness/deploy-status-action@v0.1.1
           env:
             ISSUE_TOKEN: "${{ secrets.GITHUB_TOKEN }}"
             AIRBRAKE_KEY: ${{secrets.GH_AIRBRAKE_KEY}}
    ```

2. Create `block deploys` for blocking the deploy and `emergency deploy` label for overriding the block in your repository.

3. Add deploy status as required check in branch protection.

   ![Required status](images/require_status.png)

5. To block the deploy now open an issue with label `block deploys`. It will block all the deploys and show th status on PRs.

    ![Deploy status](images/deploy_status.png)
