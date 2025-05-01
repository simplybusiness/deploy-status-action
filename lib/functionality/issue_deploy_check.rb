# frozen_string_literal: true

require 'json'
require 'octokit'
require_relative 'simply_issue'

# Check if the deploy status issue created is already present
class IssueDeployCheck < BaseDeployCheck
  def self.check_current_issue(config)
    return unless SimplyIssue.get_label_tags(config).include?('block deploys')

    action = config.event_payload['action']

    puts "Event: #{action} called"
    puts '==============================================='

    create_status_for_all_prs(config, 'failure') if action == 'labeled'

    if action == 'closed' && SimplyIssue.get_all_issues(config, 'issues', 'block deploys').empty?
      create_status_for_all_prs(config, 'success')
    end
  end

  def self.create_status_for_all_prs(config, status)
    config.client.auto_paginate = true

    icon = status == 'failure' ? ':boom:' : ':sparkles:'
    description = status == 'failure' ? 'Deploys are blocked' : 'You are free to deploy'

    SimplyIssue.get_all_issues(config, 'pull_request').each do |pr|
      sha = pr['head']['sha']
      target_url = config.event_payload['html_url']

      result = create_status(config, sha, status, description)

      create_github_summary(build_message(icon, description, result, sha, target_url))
      create_log_summary(result, pr_number: pr.number, target_url: target_url)
    end
  end
end
