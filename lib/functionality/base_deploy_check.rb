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
    puts "Created #{result[:state]} state with description #{result[:description]}"
    print "for sha #{sha} and url #{result[:url]}"
    puts '========================================================================='
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

  def self.build_message(icon, description, result, sha)
    <<~MESSAGE
      ## Deploy Status Check
      ### #{icon} #{description} #{icon}:
      - Created #{result[:state]} state with description: #{result[:description]}
      - for sha #{sha} and url #{result[:url]}
    MESSAGE
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
