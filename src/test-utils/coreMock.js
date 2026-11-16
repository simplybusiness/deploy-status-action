import { jest } from "@jest/globals";

// The parts of @actions/core that the action uses
export function coreMock() {
  return {
    info: jest.fn(),
    debug: jest.fn(),
    warning: jest.fn(),
    setFailed: jest.fn(),
    setSecret: jest.fn(),
  };
}
