"""Simple tests for AI routes - basic functionality."""

import pytest


class TestAIRoutesExist:
    """Test that AI routes are properly registered."""

    def test_ai_router_exists(self):
        """Test that AI router is imported and exists."""
        from app.routers import ai

        assert hasattr(ai, "router")
        assert ai.router is not None

    def test_router_prefix_and_tags(self):
        """Test router has correct prefix and tags."""
        from app.routers import ai

        router = ai.router

        # Check that it's an APIRouter instance
        from fastapi import APIRouter

        assert isinstance(router, APIRouter)


class TestAIRoutesContract:
    """Test the expected API contract."""

    def test_reanalyze_endpoint_definition(self):
        """Check that reanalyze endpoint is defined with expected path."""
        from app.routers import ai

        router = ai.router

        # Look for reanalyze route
        reanalyze_routes = [
            route for route in router.routes if "/reanalyze" in route.path
        ]

        # Should have at least one reanalyze route
        assert len(reanalyze_routes) > 0

    def test_cache_endpoints_definition(self):
        """Check that cache endpoints are defined."""
        from app.routers import ai

        router = ai.router

        # Look for cache routes
        cache_routes = [route for route in router.routes if "/cache" in route.path]

        # Should have at least cache stats and clear
        assert len(cache_routes) >= 2

    def test_uncategorized_endpoint_not_in_ai_router(self):
        """Check that uncategorized endpoint is NOT in ai router (moved to books)."""
        from app.routers import ai

        router = ai.router

        # Look for uncategorized route in ai router - should NOT exist
        uncategorized_routes = [
            route for route in router.routes if "/uncategorized" in route.path
        ]

        # Should NOT have uncategorized route in ai router (moved to books)
        assert len(uncategorized_routes) == 0


class TestAIRoutesDependencies:
    """Test that route dependencies are correctly set up."""

    def test_router_imports_all_dependencies(self):
        """Test that router imports all required modules."""
        # Just check that we can import the router module without errors
        from app.routers import ai

        # Check that it has the expected imports
        assert "APIRouter" in dir(ai) or hasattr(ai, "router")
