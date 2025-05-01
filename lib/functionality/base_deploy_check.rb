# frozen_string_literal: true

require 'json'
require 'octokit'
require_relative 'simply_issue'

# Checks the deploy checks present
class BaseDeployCheck
  def self.base_check(config, event, sha)
    puts "config event branch  #{config.event_branch}"
    github_summary_message = "## Deploy Status Check\n "
    result = nil
    if SimplyIssue.block_deploys?(config, event)
      github_summary_message += "### :boom: Deploys are blocked :boom:\n"
      result = create_failure_status(config, sha)
    else
      github_summary_message += "### :tada: You are free to deploy :tada:\n"
      result = create_success_status(config, sha)
    end
    github_summary_message += "- Created #{result[:state]} state with description: #{result[:description]}\n"
    github_summary_message += "- for sha #{sha} and url #{result[:url]}\n"
    create_github_summary(github_summary_message)
    puts "Created #{result[:state]} state with description #{result[:description]}"
    print "for sha #{sha} and url #{result[:url]}"
    puts '========================================================================='
    result
  end

  def self.create_failure_status(config, sha)
    config.client.create_status(
      config.app_repo, sha, 'failure',
      description: 'Deploys are blocked',
      context: context_name,
      target_url: config.event_payload['html_url']
    )
  end

  def self.create_success_status(config, sha)
    config.client.create_status(
      config.app_repo, sha, 'success',
      description: 'You are free to deploy',
      context: context_name,
      target_url: config.event_payload['html_url']
    )
  end

  def self.create_github_summary(github_summary_message)
    File.open(ENV.fetch('GITHUB_STEP_SUMMARY'), 'w') do |file|
      file.puts github_summary_message
    end
  end

  def self.context_name
    'Deploy status'
  end
end
