# frozen_string_literal: true

require 'octokit'
require 'json'
require 'openssl'
require 'jwt'

TEN_MINUTES = 600 # seconds

# Sets the github client and event payload
class GithubApiConfig
  def initialize
    @app_repo = Octokit::Repository.new(ENV.fetch('GITHUB_REPOSITORY'))
    @event_payload = JSON.parse(File.read(ENV.fetch('GITHUB_EVENT_PATH')))
    @event_name = ENV.fetch('GITHUB_EVENT_NAME')
    @event_branch = ENV.fetch('GITHUB_REF')
    @client = Octokit::Client.new(access_token: access_token)
  end
  attr_reader :client, :app_repo, :event_payload, :event_name, :event_branch

  def access_token
    bearer_client = Octokit::Client.new(bearer_token: bearer_token)
    installation = bearer_client.find_repository_installation(event_payload['repository']['full_name'])
    response = bearer_client.create_app_installation_access_token(installation[:id])
    response[:token]
  end

  def bearer_token
    payload = {
      iat: Time.now.to_i,
      exp: Time.now.to_i + TEN_MINUTES,
      iss: ENV.fetch('CLIENT_ID')
    }

    private_key = OpenSSL::PKey::RSA.new(ENV.fetch('PRIVATE_KEY'))

    JWT.encode(payload, private_key, 'RS256')
  end
end
