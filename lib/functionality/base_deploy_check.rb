# frozen_string_literal: true

require 'json'
require 'octokit'
require_relative 'simply_issue'

# Checks the deploy checks present
class BaseDeployCheck
  def self.base_check(config, event, sha)
    puts "config event branch  #{config.event_branch}"
    github_summary_message = ""
    result = if SimplyIssue.block_deploys?(config, event)
               config.client.create_status(
                 config.app_repo, sha, 'failure',
                 description: 'Deploys are blocked',
                 context: context_name,
                 target_url: config.event_payload['html_url']
               )
               github_summary_message += ":boom: Deploys are blocked :boom: "
             else
               config.client.create_status(
                 config.app_repo, sha, 'success',
                 description: 'You are free to deploy',
                 context: context_name,
                 target_url: config.event_payload['html_url']
               )
               github_summary_message += "You are free to deploy "
             end
    github_summary_message += "Created #{result[:state]} state with description #{result[:description]}"
    github_summary_message += "for sha #{sha} and url #{result[:url]}\ "
    github_summary_message += "with target_url #{config.event_payload['html_url']}\ "
    github_summary_message += '========================================================================='
    create_github_summary(github_summary_message)
    puts "Created #{result[:state]} state with description #{result[:description]}"
    print "for sha #{sha} and url #{result[:url]}"
    puts '========================================================================='
    result
  end

  def self.create_github_summary(github_summary_message)
    File.open(ENV.fetch('GITHUB_STEP_SUMMARY', nil), 'w') do |file|
      file.puts github_summary_message
    end
  end

  def self.context_name
    'Deploy status'
  end
end
