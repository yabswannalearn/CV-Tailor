"""The editable local profile contains professional facts, not imported demo data."""

from decimal import Decimal, InvalidOperation
from typing import Annotated, Literal
from urllib.parse import urlsplit

from pydantic import BaseModel, ConfigDict, Field, model_validator


ShortText = Annotated[str, Field(max_length=300)]
Stage = Literal["inbox", "shortlisted", "skipped"]


class MinimumRate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    amount: str = Field(max_length=30)
    currency: str = Field(pattern=r"^[A-Z]{3}$")
    period: Literal["hour", "month", "project"]

    @model_validator(mode="after")
    def positive_rate(self):
        try:
            amount = Decimal(self.amount)
        except InvalidOperation:
            raise ValueError("Enter a positive minimum rate.") from None
        if not amount.is_finite() or amount <= 0:
            raise ValueError("Enter a positive minimum rate.")
        return self


class FreelancerProfile(BaseModel):
    model_config = ConfigDict(extra="forbid")
    name: str = Field(default="", max_length=150)
    services: list[ShortText] = Field(default_factory=list, max_length=30)
    skills: list[ShortText] = Field(default_factory=list, max_length=100)
    experience: list[Annotated[str, Field(max_length=4000)]] = Field(default_factory=list, max_length=40)
    availability: str = Field(default="", max_length=300)
    preferred_contract_types: list[Literal["Part Time", "Full Time", "Gig"]] = Field(default_factory=list, max_length=3)
    target_industries: list[ShortText] = Field(default_factory=list, max_length=30)
    minimum_rate: MinimumRate | None = None
    unknowns: list[ShortText] = Field(default_factory=list, max_length=30)
    portfolio_links: list[Annotated[str, Field(max_length=1000)]] = Field(default_factory=list, max_length=20)
    original_cv: str = Field(default="", max_length=30000)

    @model_validator(mode="after")
    def trim_facts(self):
        self.name, self.availability = self.name.strip(), self.availability.strip()
        self.original_cv = self.original_cv.strip()
        for field in ("services", "skills", "experience", "target_industries", "unknowns", "portfolio_links"):
            values = dict.fromkeys(value.strip() for value in getattr(self, field) if value.strip())
            setattr(self, field, list(values))
        for link in self.portfolio_links:
            parsed = urlsplit(link)
            if parsed.scheme not in ("http", "https") or not parsed.hostname or parsed.username or parsed.password:
                raise ValueError("Portfolio links must be public HTTP or HTTPS URLs without credentials.")
        return self


DraftKind = Literal["cover_letter", "proposal"]


class DraftRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    model: str = Field(min_length=1, max_length=150)
    opportunity_id: int = Field(gt=0)
    kind: DraftKind = "cover_letter"


class DraftEditRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    subject: str = Field(min_length=1, max_length=200)
    body: str = Field(min_length=1, max_length=20000)
    revision: int = Field(ge=0)
    reviewed: bool = False

    @model_validator(mode="after")
    def nonempty_text(self):
        self.subject, self.body = self.subject.strip(), self.body.strip()
        if not self.subject or not self.body:
            raise ValueError("The subject and application text cannot be blank.")
        return self


class UserStateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    stage: Stage | None = None
    notes: str | None = Field(default=None, max_length=20000)
