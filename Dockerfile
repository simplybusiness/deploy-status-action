FROM ruby:2.6.5

LABEL "com.github.actions.name"="Deploy Issue Workflow"
LABEL "com.github.actions.description"="Check if deploy is blocked"
LABEL "com.github.actions.icon"="filter"
LABEL "com.github.actions.color"="red"
LABEL maintainer="simplybusiness <opensourcetech@simplybusiness.co.uk>"

ENV BUNDLER_VERSION="2.1.4"

RUN gem install bundler --version "${BUNDLER_VERSION}"


RUN mkdir -p /runner/action

WORKDIR /runner/action

COPY Gemfile* ./

COPY lib ./lib

RUN bundle install --retry 3

ENV BUNDLE_GEMFILE /runner/action/Gemfile

RUN chmod +x /runner/action/lib/action.rb

ENTRYPOINT ["ruby", "/runner/action/lib/action.rb"]
