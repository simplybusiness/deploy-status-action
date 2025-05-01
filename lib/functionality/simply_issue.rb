# frozen_string_literal: true

require 'json'
require 'octokit'

# Fetch the labels on PR and issue
class SimplyIssue
  def self.get_label_tags(config)
    if ['pull_request', 'pull_request_target'].include?(config.event_name)
      puts "Pull request #{config.event_payload['number']}"
      issue = config.client.pull_request(config.app_repo, config.event_payload['number'])
    else
      issue = config.client.issue(config.app_repo, config.event_payload['issue']['number'])
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
end
