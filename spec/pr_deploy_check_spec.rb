# frozen_string_literal: true

require_relative 'spec_helper'
require_relative '../lib/config/github_api_config'
require_relative '../lib/functionality/simply_issue'
require_relative '../lib/functionality/pr_deploy_check'
require_relative '../lib/functionality/issue_deploy_check'
require_relative '../lib/functionality/base_deploy_check'

RSpec.describe PrDeployCheck do
  context 'when pr is labeled with emergency deploy tag' do
    before do
      ENV['GITHUB_REPOSITORY'] = 'simplybusiness/important-app'
      ENV['CLIENT_ID'] = 'client_id'
      ENV['PRIVATE_KEY'] = JWT::JWK.new(OpenSSL::PKey::RSA.new(2048)).keypair.to_pem
      ENV['GITHUB_EVENT_PATH'] = Pathname.new(SPEC_FIXTURES_PATH).join('labeled_pr_payload.json').to_s
      ENV['GITHUB_REF'] = 'ref/heads/test-branch'
      ENV['GITHUB_EVENT_NAME'] = 'pull_request'
      ENV['GITHUB_STEP_SUMMARY'] = '/tmp/summary.tmp'
    end

    it 'returns a success for the deploy check' do
      VCR.use_cassette('emergency deploy update success') do
        config = GithubApiConfig.new
        response = PrDeployCheck.check_labeled_pr(config)
        expect(response['state']).to eq('success')
      end
    end
  end
end
