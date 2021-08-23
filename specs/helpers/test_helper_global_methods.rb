# frozen_string_literal: true

# frozen_string_literal: true.

def configure_vcr
  require 'webmock'
  require 'vcr'
  VCR.configure do |c|
    vcr_config(c)
  end
end

private

def vcr_config(config)
  config.cassette_library_dir = 'specs/fixtures/vcr_cassettes'
  config.hook_into :webmock
  config.allow_http_connections_when_no_cassette = true
  cassette_options(config)
  config.before_record do |i|
    i.response.body.force_encoding('UTF-8')
  end
  config.configure_rspec_metadata!
end

def cassette_options(config)
  config.default_cassette_options = {
    allow_playback_repeats: true,
    match_requests_on: [:method, VCR.request_matchers.uri_without_param(:account_code, :license_code)]
  }
end
