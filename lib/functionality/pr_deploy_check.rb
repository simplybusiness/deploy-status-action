# frozen_string_literal: true

require 'json'
require 'octokit'
require_relative 'simply_issue'
require_relative 'base_deploy_check'

# Check if the emergency deploy present
class PrDeployCheck < BaseDeployCheck
  def self.check_labeled_pr(config)
    label_tags = SimplyIssue.get_label_tags(config)
    return unless label_tags.include?('emergency deploy')

    sha = config.event_payload['pull_request']['head']['sha']
    description = "You are free to deploy"
    icon = ":sparkles:"
    result = create_status(config, sha, "success", description)
    message = build_message(icon, description, result, sha, config.event_payload['html_url'])

    create_github_summary(message)
    create_log_summary(result, sha, config.event_payload['html_url'])
    result
  end
end
