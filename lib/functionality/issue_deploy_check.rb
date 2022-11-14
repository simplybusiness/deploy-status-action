# frozen_string_literal: true

require 'json'
require 'octokit'
require_relative 'simply_issue'

# Check if the deploy status issue created is already present
class IssueDeployCheck < BaseDeployCheck
  def self.check_current_issue(config)
    label_tags = SimplyIssue.get_label_tags(config)
    return unless label_tags.include?('block deploys')

    puts "Event: #{config.event_payload['action']} called"
    puts '==============================================='

    case config.event_payload['action']
    when 'labeled'
      create_status_for_all_prs(config, 'failure', 'Deploys are blocked')
    when 'closed'
      if SimplyIssue.get_all_issues(config, 'issues', 'block deploys').length.zero?
        create_status_for_all_prs(config, 'success', 'You are free to deploy')
      end
    end
  end

  def self.create_status_for_all_prs(config, status, message)
    config.client.auto_paginate = true
    all_pull_requests = SimplyIssue.get_all_issues(config, 'pull_request')
    all_pull_requests.each do |pr|
      result = config.client.create_status(
        config.app_repo, pr['head']['sha'], status,
        description: message,
        options: { context: context_name, target_url: config.event_payload['html_url'] }
      )
      puts "Created #{result[:state]} state with" \
           " description #{result[:description]} for PR #{pr.number} and url #{result[:url]}" \
           " with target_url #{config.event_payload['html_url']}"
      puts '============================================================================================'
    end
  end
end
