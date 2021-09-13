# frozen_string_literal: true

require 'json'

require_relative 'config/airbrake'
require_relative 'config/github_api_config'
require_relative 'functionality/simply_issue'
require_relative 'functionality/pr_deploy_check'
require_relative 'functionality/issue_deploy_check'
require_relative 'functionality/base_deploy_check'

begin
  config = GithubApiConfig.new
  puts "Event: #{config.event_name} called"
  case config.event_name
  when 'pull_request_target' || 'pull_request'
    if config.event_payload['action'] == 'opened' || config.event_payload['action'] == 'synchronize'
      puts 'Pull request is opened or synchronized'
      puts '============================================='
      PrDeployCheck.base_check(config, 'issues', config.event_payload[config.event_name]['head']['sha'])
    else
      puts 'Pull request is labeled'
      puts '============================================='
      PrDeployCheck.check_labeled_pr(config)
    end
  when 'push'
    BaseDeployCheck.base_check(config, 'issues', config.event_payload['after'])
  when 'issues'
    IssueDeployCheck.check_current_issue(config)
  end
rescue StandardError => e
  puts "Unexpected error occurred: #{e.message}"
  Airbrake.notify_sync(
    e, {
      repo: 'simplybusiness/deploy-status-action',
      github_action: 'deploy_action'
    }
  )
end
