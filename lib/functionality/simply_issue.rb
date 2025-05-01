# frozen_string_literal: true

require 'json'
require 'octokit'

# Fetch the labels on PR and issue
class SimplyIssue
  def self.get_label_tags(config)
    repo = config.app_repo
    payload = config.event_payload
    client = config.client

    issue = if is_pr_event?(config)
              client.pull_request(repo, payload['number'])
            else
              client.issue(repo, payload['issue']['number'])
            end

    issue['labels'].inject([]) { |memo, label| memo.push(label['name']) }
  end

  def self.get_all_issues(config, aspect, label = nil)
    case aspect
    when 'pull_request'
      config.client.pull_requests(config.app_repo, state: 'open')
    when 'issues'
      config.client.list_issues(config.app_repo, state: 'open', direction: 'desc', labels: label)
    end
  end

  def self.block_deploys?(config, event)
    any_block_deploys = get_all_issues(config, event, 'block deploys').length.positive?
    any_block_deploys && !SimplyIssue.get_label_tags(config).include?('emergency deploy')
  end

  def self.is_pr_event?(config)
    is_pr_event = ['pull_request', 'pull_request_target'].include?(config.event_name)
    puts "Pull request #{config.event_payload['number']}" if is_pr_event

    is_pr_event
  end
end
