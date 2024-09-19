# frozen_string_literal: true

require 'octokit'
require 'json'
require 'openssl'
require 'jwt'

# Sets the github client and event payload
class GithubApiConfig
  def generate_jwt
    private_key = OpenSSL::PKey::RSA.new(ENV.fetch('PRIVATE_KEY'))

    payload = {
      iat: Time.now.to_i - 60,
      exp: Time.now.to_i + (10 * 60),
      iss: ENV.fetch('CLIENT_ID')
    }

    JWT.encode(payload, private_key, "RS256")
  end

  def initialize
    generate_jwt
    @client = Octokit::Client.new(:bearer_token => generate_jwt)
    @app_repo = Octokit::Repository.new(ENV.fetch('GITHUB_REPOSITORY'))
    @event_payload = JSON.parse(File.read(ENV.fetch('GITHUB_EVENT_PATH')))
    @event_name = ENV.fetch('GITHUB_EVENT_NAME')
    @event_branch = ENV.fetch('GITHUB_REF')
  end
  attr_reader :client, :app_repo, :event_payload, :event_name, :event_branch
end
