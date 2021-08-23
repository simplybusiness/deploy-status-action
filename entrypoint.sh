#!/bin/sh

set -e

# Lock Faraday and Octokit versions until Octokit fixes their code with latest Faraday: https://trello.com/c/FVYLuxEX/120-bug-chopin-deploy-faraday-issue-workflow-failing
sh -c "gem install faraday -v 0.17.1"
sh -c "gem install octokit -v 4.14.0"
sh -c "gem install airbrake-ruby -v 4.13.0"

sh -c "ruby /action/lib/action.rb $*"
