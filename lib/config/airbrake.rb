# frozen_string_literal: true

require 'airbrake-ruby'

Airbrake.configure do |c|
  c.project_id = 258_121
  c.project_key = ENV['AIRBRAKE_KEY']
end
