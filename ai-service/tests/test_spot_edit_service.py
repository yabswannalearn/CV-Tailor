import json
import sys
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from models.schemas import SpotEditRequest
from services.spot_edit_service import build_spot_edit_prompt, rewrite_blocks


def make_profile():
    return SimpleNamespace(
        experience=[
            SimpleNamespace(
                company="AgentGenius AI",
                job_title="AI Engineer",
                description="Built agent flows with Claude Code and n8n for SMB clients.",
            ),
        ],
        projects=[
            SimpleNamespace(
                name="PXX Spark Autonomous Agent",
                description="Autonomous n8n agent with RLHF self-optimisation.",
            ),
        ],
        skills=[SimpleNamespace(skill_name="RAG Pipelines"), SimpleNamespace(skill_name="FastAPI")],
        certifications=[SimpleNamespace(name="AWS Cloud Practitioner")],
    )


def make_request(**overrides):
    payload = dict(
        email="user@example.com",
        instruction="Make this more metric-heavy.",
        jd="Seeking an AI engineer with RAG experience.",
        blocks=[{
            "id": "bullet:0",
            "kind": "bullet",
            "section": "Experience",
            "text": "Architected end-to-end AI agent flows using Claude Code and n8n.",
            "entry_title": "AgentGenius AI",
            "entry_subtitle": "AI Engineer",
        }],
    )
    payload.update(overrides)
    payload["blocks"] = [dict(block, order=block.get("order", index)) for index, block in enumerate(payload["blocks"])]
    return SpotEditRequest(**payload)


def fake_response(payload):
    return SimpleNamespace(text=json.dumps(payload))


class BuildSpotEditPromptTests(unittest.TestCase):
    def test_grounds_a_bullet_in_the_profile_row_it_came_from(self):
        prompt = build_spot_edit_prompt(make_profile(), make_request())

        self.assertIn("Built agent flows with Claude Code and n8n for SMB clients.", prompt)
        self.assertIn("AgentGenius AI", prompt)

    def test_grounds_a_project_bullet_in_the_matching_project(self):
        request = make_request(blocks=[{
            "id": "bullet:4",
            "kind": "bullet",
            "section": "Projects",
            "text": "Architected an autonomous agent for orchestration tasks.",
            "entry_title": "PXX Spark Autonomous Agent",
        }])

        self.assertIn("Autonomous n8n agent with RLHF self-optimisation.", build_spot_edit_prompt(make_profile(), request))

    def test_warns_the_model_when_no_profile_row_matches(self):
        request = make_request(blocks=[{
            "id": "bullet:9",
            "kind": "bullet",
            "section": "Experience",
            "text": "Some bullet.",
            "entry_title": "A Company That Was Renamed",
        }])

        self.assertIn("Do not introduce new facts", build_spot_edit_prompt(make_profile(), request))

    def test_grounds_a_skills_row_in_the_declared_skill_list(self):
        request = make_request(blocks=[{
            "id": "detail:skills:0",
            "kind": "detail",
            "section": "Technical Skills",
            "label": "AI Engineering",
            "text": "RAG Pipelines",
        }])
        prompt = build_spot_edit_prompt(make_profile(), request)

        self.assertIn("RAG Pipelines, FastAPI", prompt)
        self.assertIn("Use only these", prompt)

    def test_grounds_a_certifications_row_in_the_declared_certifications(self):
        request = make_request(blocks=[{
            "id": "detail:certifications:0",
            "kind": "detail",
            "section": "Certifications",
            "text": "AWS Cloud Practitioner",
        }])

        self.assertIn("AWS Cloud Practitioner", build_spot_edit_prompt(make_profile(), request))

    def test_gives_the_summary_the_roles_and_skills_digest_not_the_whole_profile(self):
        request = make_request(blocks=[{
            "id": "summary",
            "kind": "summary",
            "section": "Summary",
            "text": "AI Product Engineer with proven experience.",
        }])
        prompt = build_spot_edit_prompt(make_profile(), request)

        self.assertIn("AI Engineer at AgentGenius AI", prompt)
        self.assertNotIn("Built agent flows with Claude Code", prompt)

    def test_caps_each_block_so_a_rewrite_cannot_break_the_one_page_rule(self):
        prompt = build_spot_edit_prompt(make_profile(), make_request())
        self.assertIn("MAX CHARACTERS:", prompt)

    def test_forbids_placeholders_and_invented_numbers(self):
        prompt = build_spot_edit_prompt(make_profile(), make_request())

        self.assertIn("never invent a number", prompt)
        self.assertIn("[X]", prompt)


class RewriteBlocksTests(unittest.TestCase):
    def test_returns_rewrites_in_request_order_with_collapsed_whitespace(self):
        request = make_request(instruction="Make these more concise.", blocks=[
            {"id": "bullet:0", "kind": "bullet", "section": "Experience", "text": "First bullet."},
            {"id": "bullet:1", "kind": "bullet", "section": "Experience", "text": "Second bullet."},
        ])
        payload = {"blocks": [
            {"id": "bullet:1", "text": "Second   rewritten.", "note": ""},
            {"id": "bullet:0", "text": "First rewritten.", "note": "no figure available"},
        ]}

        with patch("services.spot_edit_service.client") as client:
            client.models.generate_content.return_value = fake_response(payload)
            result = rewrite_blocks(make_profile(), request)

        self.assertEqual([item["id"] for item in result], ["bullet:0", "bullet:1"])
        self.assertEqual(result[1]["text"], "Second rewritten.")
        self.assertEqual(result[0]["note"], "no figure available")

    def test_rejects_a_response_that_drops_a_block(self):
        request = make_request(blocks=[
            {"id": "bullet:0", "kind": "bullet", "section": "Experience", "text": "First bullet."},
            {"id": "bullet:1", "kind": "bullet", "section": "Experience", "text": "Second bullet."},
        ])

        with patch("services.spot_edit_service.client") as client:
            client.models.generate_content.return_value = fake_response({"blocks": [{"id": "bullet:0", "text": "Only one."}]})
            with self.assertRaises(ValueError):
                rewrite_blocks(make_profile(), request)

    def test_rejects_extra_or_duplicate_block_rewrites(self):
        payload = {"blocks": [
            {"id": "bullet:0", "text": "Rewritten."},
            {"id": "bullet:0", "text": "Rewritten twice."},
        ]}
        with patch("services.spot_edit_service.client") as client:
            client.models.generate_content.return_value = fake_response(payload)
            with self.assertRaises(ValueError):
                rewrite_blocks(make_profile(), make_request())

    def test_rejects_a_number_that_is_absent_from_the_current_block_and_profile(self):
        payload = {"blocks": [{"id": "bullet:0", "text": "Cut processing time by 40%."}]}
        with patch("services.spot_edit_service.client") as client:
            client.models.generate_content.return_value = fake_response(payload)
            with self.assertRaisesRegex(ValueError, "unsupported number"):
                rewrite_blocks(make_profile(), make_request())

    def test_allows_a_number_already_present_in_the_profile_source(self):
        profile = make_profile()
        profile.experience[0].description = "Cut processing time by 40% using n8n automation."
        payload = {"blocks": [{"id": "bullet:0", "text": "Cut processing time by 40% using n8n."}]}
        with patch("services.spot_edit_service.client") as client:
            client.models.generate_content.return_value = fake_response(payload)
            result = rewrite_blocks(profile, make_request())
        self.assertEqual(result[0]["text"], "Cut processing time by 40% using n8n.")

    def test_rejects_placeholders_even_if_the_model_ignores_the_prompt(self):
        payload = {"blocks": [{"id": "bullet:0", "text": "Improved throughput by [X]%."}]}
        with patch("services.spot_edit_service.client") as client:
            client.models.generate_content.return_value = fake_response(payload)
            with self.assertRaisesRegex(ValueError, "plain resume text"):
                rewrite_blocks(make_profile(), make_request())

    def test_rejects_an_empty_rewrite(self):
        with patch("services.spot_edit_service.client") as client:
            client.models.generate_content.return_value = fake_response({"blocks": [{"id": "bullet:0", "text": "   "}]})
            with self.assertRaises(ValueError):
                rewrite_blocks(make_profile(), make_request())

    def test_rejects_unparseable_json(self):
        with patch("services.spot_edit_service.client") as client:
            client.models.generate_content.return_value = SimpleNamespace(text="I cannot help with that.")
            with self.assertRaises(ValueError):
                rewrite_blocks(make_profile(), make_request())

    def test_tolerates_code_fences_around_the_json(self):
        fenced = "```json\n" + json.dumps({"blocks": [{"id": "bullet:0", "text": "Rewritten."}]}) + "\n```"

        with patch("services.spot_edit_service.client") as client:
            client.models.generate_content.return_value = SimpleNamespace(text=fenced)
            result = rewrite_blocks(make_profile(), make_request(instruction="Make this concise."))

        self.assertEqual(result[0]["text"], "Rewritten.")
        self.assertEqual(result[0]["note"], "")

    def test_requires_a_note_when_metric_data_was_requested_but_unavailable(self):
        payload = {"blocks": [{"id": "bullet:0", "text": "Streamlined AI agent delivery for SMB clients.", "note": ""}]}
        with patch("services.spot_edit_service.client") as client:
            client.models.generate_content.return_value = fake_response(payload)
            with self.assertRaisesRegex(ValueError, "numeric data was unavailable"):
                rewrite_blocks(make_profile(), make_request())


class SpotEditRequestValidationTests(unittest.TestCase):
    def test_rejects_more_blocks_than_a_spot_edit_may_cover(self):
        blocks = [
            {"id": f"bullet:{index}", "kind": "bullet", "section": "Experience", "text": "A bullet."}
            for index in range(7)
        ]
        with self.assertRaises(Exception):
            make_request(blocks=blocks)

    def test_rejects_an_empty_instruction(self):
        with self.assertRaises(Exception):
            make_request(instruction="")

    def test_rejects_blocks_from_multiple_sections(self):
        with self.assertRaises(Exception):
            make_request(blocks=[
                {"id": "summary", "kind": "summary", "section": "Summary", "text": "A summary."},
                {"id": "bullet:0", "kind": "bullet", "section": "Experience", "text": "A bullet."},
            ])

    def test_rejects_duplicate_block_addresses(self):
        with self.assertRaises(Exception):
            make_request(blocks=[
                {"id": "bullet:0", "kind": "bullet", "section": "Experience", "text": "First."},
                {"id": "bullet:0", "kind": "bullet", "section": "Experience", "text": "Second."},
            ])

    def test_rejects_a_non_contiguous_or_out_of_order_block_run(self):
        with self.assertRaises(Exception):
            make_request(blocks=[
                {"id": "bullet:0", "order": 3, "kind": "bullet", "section": "Experience", "text": "First."},
                {"id": "bullet:2", "order": 5, "kind": "bullet", "section": "Experience", "text": "Third."},
            ])


if __name__ == "__main__":
    unittest.main()
