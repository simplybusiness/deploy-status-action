# frozen_string_literal: true

require_relative 'spec_helper'
require_relative '../lib/config/github_api_config'
require_relative '../lib/functionality/base_deploy_check'
require_relative '../lib/functionality/pr_deploy_check'
require 'jwt'

RSpec.describe 'BaseDeployCheck' do
  before do
    ENV['GITHUB_REPOSITORY'] = 'simplybusiness/important-app'
    ENV['CLIENT_ID'] = 'client_id'
    ENV['PRIVATE_KEY'] = JWT::JWK.new(OpenSSL::PKey::RSA.new(2048)).keypair.to_pem
  end

  let(:config) { GithubApiConfig.new }

  context 'when there are no blocked deploy issues' do
    it 'returns a success for the deploy check' do
      ENV['GITHUB_EVENT_PATH'] = Pathname.new(SPEC_FIXTURES_PATH).join('open_pr_payload.json').to_s
      ENV['GITHUB_REF'] = 'ref/heads/test-branch'
      ENV['GITHUB_EVENT_NAME'] = 'pull_request'
      sha = '03743b2ec1b201cec2de04ebebbac6e74afab281'

      VCR.use_cassette('no blocked deploy update success') do
        response = PrDeployCheck.base_check(config, 'issues', sha)
        expect(response['state']).to eq('success')
      end
    end
  end

  context 'when there are blocked deploy issues' do
    it 'returns a failure for the deploy check' do
      ENV['GITHUB_EVENT_PATH'] = Pathname.new(SPEC_FIXTURES_PATH).join('open_pr_payload.json').to_s
      ENV['GITHUB_REF'] = 'ref/heads/test-branch'
      ENV['GITHUB_EVENT_NAME'] = 'pull_request'
      sha = '03743b2ec1b201cec2de04ebebbac6e74afab281'

      VCR.use_cassette('blocked deploy update failure') do
        response = PrDeployCheck.base_check(config, 'issues', sha)
        expect(response['state']).to eq('failure')
      end
    end
  end
end
