import {
  FRAME_MATERIALS,
  FRAME_SHAPES,
  GENDERS,
  LENS_COATINGS,
  LENS_DESIGNS,
  LENS_MATERIALS,
  LENS_SOLD_AS,
  RIM_TYPES,
} from '@shared/enums';

import { BoolField, NumberField, SelectField, TextField } from './fields';

import type { AttrsForm } from './helpers';
import type { ProductType } from '@shared/enums';

/**
 * The type-aware half of the product form.
 *
 * One section per attribute shape, chosen by the product's `type`. Frames and sunglasses share
 * a section because they share a shape — the trade treats them as one article with different
 * lenses in it, and the union models them that way.
 *
 * Every field's `name` is a path into `attrs`, so the shared union validates it and the error
 * arrives already addressed to the right input. Nothing here re-states a rule: which values a
 * dropdown offers comes from the same enums the API validates against.
 */
export function AttributeFields({ form, type }: { form: AttrsForm; type: ProductType }) {
  switch (type) {
    case 'FRAME':
    case 'SUNGLASS':
      return <FrameFields form={form} />;
    case 'LENS':
      return <LensFields form={form} />;
    case 'ACCESSORY':
      return <AccessoryFields form={form} />;
    case 'MACHINE':
      return <MachineFields form={form} />;
    default:
      return null;
  }
}

function FrameFields({ form }: { form: AttrsForm }) {
  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-3">
        <TextField form={form} name="attrs.modelNo" label="Model no." placeholder="RB3025" />
        <TextField form={form} name="attrs.color" label="Colour" placeholder="Gold" />
        <TextField
          form={form}
          name="attrs.colorCode"
          label="Colour code"
          placeholder="001/58"
        />
      </div>

      {/*
        The three numbers moulded into every temple arm. Kept as separate inputs rather than the
        "52-18-140" string they are printed as, because the list filters and any future fitting
        logic need to compare them numerically.
      */}
      <div>
        <p className="mb-2 text-sm font-medium">Size (mm)</p>
        <div className="grid gap-4 sm:grid-cols-3">
          <NumberField form={form} name="attrs.size.eye" label="Eye" placeholder="52" />
          <NumberField form={form} name="attrs.size.bridge" label="Bridge" placeholder="18" />
          <NumberField form={form} name="attrs.size.temple" label="Temple" placeholder="140" />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <SelectField
          form={form}
          name="attrs.material"
          label="Material"
          options={FRAME_MATERIALS}
        />
        <SelectField form={form} name="attrs.shape" label="Shape" options={FRAME_SHAPES} />
        <SelectField form={form} name="attrs.rimType" label="Rim" options={RIM_TYPES} />
        <SelectField form={form} name="attrs.gender" label="For" options={GENDERS} />
      </div>

      <TextField
        form={form}
        name="attrs.lensColor"
        label="Lens colour"
        placeholder="G-15 Green"
      />

      <div className="grid gap-x-6 sm:grid-cols-3">
        <BoolField form={form} name="attrs.polarized" label="Polarized" />
        <BoolField form={form} name="attrs.uvProtection" label="UV protection" />
        <BoolField form={form} name="attrs.hasCase" label="Ships with a case" />
      </div>
    </div>
  );
}

function LensFields({ form }: { form: AttrsForm }) {
  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <SelectField
          form={form}
          name="attrs.material"
          label="Material"
          options={LENS_MATERIALS}
          placeholder="Choose"
        />
        <SelectField
          form={form}
          name="attrs.design"
          label="Design"
          options={LENS_DESIGNS}
          placeholder="Choose"
        />
        <SelectField form={form} name="attrs.coating" label="Coating" options={LENS_COATINGS} />
        <SelectField
          form={form}
          name="attrs.soldAs"
          label="Sold as"
          options={LENS_SOLD_AS}
          hint="A PAIR is one sellable unit of two."
          placeholder="Choose"
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <NumberField
          form={form}
          name="attrs.refractiveIndex"
          label="Refractive index"
          step="0.01"
          placeholder="1.56"
          hint="Higher is thinner."
        />
        <NumberField form={form} name="attrs.diameter" label="Diameter (mm)" placeholder="65" />
        <TextField form={form} name="attrs.tint" label="Tint" placeholder="Grey 80%" />
      </div>

      <BoolField
        form={form}
        name="attrs.photochromic"
        label="Photochromic"
        hint="Darkens in sunlight."
      />

      {/*
        The power grid declares what is ORDERABLE, not what exists. A single SV lens spanning
        sph −10..+8 and cyl 0..−4 is ~600 combinations; materialising those as variants would put
        24,000 dead rows in front of every catalogue query. Day 7 creates a variant only when one
        is actually received or sold, bounded by what is declared here.
      */}
      <div className="rounded-lg border p-4">
        <p className="text-sm font-medium">Power range</p>
        <p className="mb-3 text-xs text-muted-foreground">
          What may be ordered. Variants are created on first receipt, never up front — leave
          blank for a lens with a single fixed power.
        </p>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <NumberField
            form={form}
            name="attrs.grid.sphMin"
            label="Sphere min"
            step="0.25"
            placeholder="-10"
          />
          <NumberField
            form={form}
            name="attrs.grid.sphMax"
            label="Sphere max"
            step="0.25"
            placeholder="8"
          />
          <NumberField
            form={form}
            name="attrs.grid.cylMin"
            label="Cylinder min"
            step="0.25"
            placeholder="-4"
          />
          <NumberField
            form={form}
            name="attrs.grid.cylMax"
            label="Cylinder max"
            step="0.25"
            placeholder="0"
          />
          <NumberField
            form={form}
            name="attrs.grid.addMin"
            label="Addition min"
            step="0.25"
            placeholder="0.75"
          />
          <NumberField
            form={form}
            name="attrs.grid.addMax"
            label="Addition max"
            step="0.25"
            placeholder="3.00"
          />
          <NumberField
            form={form}
            name="attrs.grid.step"
            label="Step"
            step="0.125"
            placeholder="0.25"
            hint="Usually 0.25."
          />
        </div>
      </div>
    </div>
  );
}

function AccessoryFields({ form }: { form: AttrsForm }) {
  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-3">
        <NumberField form={form} name="attrs.volumeMl" label="Volume (ml)" placeholder="120" />
        <NumberField
          form={form}
          name="attrs.packSize"
          label="Units per pack"
          placeholder="6"
          hint="Items inside one sellable unit."
        />
        <NumberField
          form={form}
          name="attrs.shelfLifeDays"
          label="Shelf life (days)"
          placeholder="730"
        />
      </div>

      {/*
        Turning this on forces lot tracking — the server refuses any other mode. An expiry date
        is a property of a batch, so a product that does not record batches has nowhere to put
        one, and the Day-16 expiry report would quietly show nothing.
      */}
      <BoolField
        form={form}
        name="attrs.requiresExpiry"
        label="Expires"
        hint="Requires lot tracking, so each batch carries its own expiry date."
      />
    </div>
  );
}

function MachineFields({ form }: { form: AttrsForm }) {
  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-3">
        <TextField form={form} name="attrs.modelNo" label="Model no." placeholder="ALM-700" />
        <TextField
          form={form}
          name="attrs.manufacturer"
          label="Manufacturer"
          placeholder="Topcon"
        />
        <TextField
          form={form}
          name="attrs.countryOfOrigin"
          label="Country of origin"
          placeholder="Japan"
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <NumberField
          form={form}
          name="attrs.warrantyMonths"
          label="Warranty (months)"
          placeholder="24"
        />
        <NumberField
          form={form}
          name="attrs.serviceIntervalMonths"
          label="Service interval (months)"
          placeholder="12"
        />
        <TextField form={form} name="attrs.powerSpec" label="Power" placeholder="220V 50Hz" />
      </div>

      <TextField
        form={form}
        name="attrs.dimensions"
        label="Dimensions"
        placeholder="320 × 280 × 480 mm"
      />

      <BoolField
        form={form}
        name="attrs.installationRequired"
        label="Needs installation"
        hint="Flagged on the dispatch so an engineer is scheduled."
      />
    </div>
  );
}
