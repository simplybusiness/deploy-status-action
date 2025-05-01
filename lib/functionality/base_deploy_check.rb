# frozen_string_literal: true

require 'json'
require 'octokit'
require_relative 'simply_issue'

# Checks the deploy checks present
class BaseDeployCheck
  def self.base_check(config, event, sha)
    puts "config event branch  #{config.event_branch}"

    state = SimplyIssue.block_deploys?(config, event) ? 'failure' : 'success'
    description = state == 'failure' ? 'Deploys are blocked' : 'You are free to deploy'
    icon = state == 'failure' ? ':boom:' : ':tada:'
    result = create_status(config, sha, state, description)

    create_github_summary(build_message(icon, description, result, sha))
    create_log_summary(result, sha: sha)

    result
  end

  def self.create_status(config, sha, state, description)
    config.client.create_status(
      config.app_repo, sha, state,
      description: description,
      context: context_name,
      target_url: config.event_payload['html_url']
    )
  end

  def self.build_message(icon, description, result, sha, target_url = nil)
    message = <<~MESSAGE
      ## Deploy Status Check
      ### #{icon} #{description} #{icon}:
      - Created #{result[:state]} state with description: #{result[:description]}
      - for sha #{sha} and url #{result[:url]}
    MESSAGE

    message += "- With target_url: #{target_url}" if target_url
    message
  end

  def self.create_github_summary(github_summary_message)
    File.open(ENV.fetch('GITHUB_STEP_SUMMARY'), 'w') do |file|
      file.puts github_summary_message
    end
  end

  def self.create_log_summary(result, pr_number: nil, sha: nil, target_url: nil)
    state = result[:state]
    description = result[:description]
    url = result[:url]

    pr_or_sha_statement = pr_number ? "for PR #{pr_number}" : "for sha #{sha}"
    target_url_statement = target_url ? " with target_url #{target_url}" : ""

    puts <<~LOG
        Created #{state} state with description #{description} #{pr_or_sha_statement}
        and url #{url} #{target_url_statement}
      =========================================================================
    LOG
  end

  def self.context_name
    'Deploy status'
  end
end
